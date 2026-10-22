import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import express from "express";
import { registerExportQueue, exportDirectory } from "../server/exportQueue";
import { createEmptyProject } from "../src/project/types";
import {
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_VARIANTS,
  slug,
  type ExportRequest,
} from "../src/project/exportPlan";

test("reintentar un lote anterior durante otro render no lo deja detenido en cola", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ugc-queue-test-"));
  let release: (() => void) | undefined;
  try {
    const app = express();
    app.use(express.json());
    let calls = 0;
    registerExportQueue(app, dir, "http://localhost", () => {
      calls++;
      return calls === 2
        ? new Promise<string>((_, reject) => {
            release = () => reject(new Error("Segundo intento controlado"));
          })
        : Promise.reject(new Error(`Intento ${calls}`));
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const request: ExportRequest = {
      project: createEmptyProject(),
      name: "Primero",
      directory: "Marca",
      ranges: [{ id: "r", name: "V1", start: 0, end: 30 }],
      variants: [DEFAULT_VARIANTS[0]],
      formats: [
        {
          id: "v",
          name: "9x16",
          width: 180,
          height: 320,
          fit: "cover",
          smart: true,
          focusX: 0.5,
          focusY: 0.5,
        },
      ],
      settings: { ...DEFAULT_EXPORT_SETTINGS },
    };
    const rows = () => fetch(base + "/api/export-queue").then((r) => r.json()),
      post = (value: ExportRequest) =>
        fetch(base + "/api/export-queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        }).then((r) => r.json());
    const wait = async (
      test: (list: { id: string; status: string }[]) => boolean,
    ) => {
      for (let n = 0; n < 100; n++) {
        const list = await rows();
        if (test(list)) return list;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("La cola no avanzó");
    };
    try {
      const a = await post(request);
      await wait((list) =>
        list.some((b) => b.id === a.id && b.status === "error"),
      );
      const b = await post({ ...request, name: "Segundo" });
      await wait((list) =>
        list.some((row) => row.id === b.id && row.status === "rendering"),
      );
      assert.equal(
        (
          await fetch(`${base}/api/export-queue/${a.id}/retry`, {
            method: "POST",
          })
        ).status,
        200,
      );
      release!();
      await wait(
        (list) =>
          list.some((row) => row.id === a.id && row.status === "error") &&
          list.some((row) => row.id === b.id && row.status === "error"),
      );
      assert.equal(calls, 3);
    } finally {
      release?.();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    const resolved = path.resolve(dir);
    if (
      resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith("ugc-queue-test-")
    )
      fs.rmSync(resolved, { recursive: true, force: true });
  }
});
test("reinicio conserva entregas terminadas, identifica interrupciones y aísla una entrada dañada", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ugc-queue-test-"));
  try {
    const project = createEmptyProject(),
      request: ExportRequest = {
        project,
        name: "Entrega",
        directory: "Marca",
        ranges: [{ id: "r", name: "V1", start: 0, end: 30 }],
        variants: [DEFAULT_VARIANTS[0]],
        formats: [
          {
            id: "v",
            name: "9x16",
            width: 180,
            height: 320,
            fit: "cover",
            smart: true,
            focusX: 0.5,
            focusY: 0.5,
          },
        ],
        settings: { ...DEFAULT_EXPORT_SETTINGS },
      };
    const completed = {
      id: randomUUID(),
      created: new Date().toISOString(),
      name: "Completada",
      status: "done",
      request: {
        ...request,
        settings: {
          ...request.settings,
          codec: "h265",
          pixelFormat: "yuv420p10le",
        },
      },
      cancelled: false,
      items: [
        { id: randomUUID(), name: "entrega.mp4", status: "done", progress: 1 },
      ],
    };
    const pending = {
      ...completed,
      id: randomUUID(),
      name: "Pendiente",
      request,
      status: "queued",
      items: [
        {
          id: randomUUID(),
          name: "pendiente.mp4",
          status: "pending",
          progress: 0,
        },
      ],
    };
    const invalid = {
      ...completed,
      id: randomUUID(),
      items: [
        {
          id: randomUUID(),
          name: "../../externo.mp4",
          status: "done",
          progress: 1,
        },
      ],
    };
    const folder = exportDirectory(
      dir,
      request.directory,
      `${slug(request.name)}_${completed.id.slice(0, 8)}`,
    );
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "entrega.mp4"), "resultado");
    fs.mkdirSync(path.join(dir, "export-jobs"));
    const original = JSON.stringify([completed, invalid, pending]),
      state = path.join(dir, "export-jobs/queue.json");
    fs.writeFileSync(state, original);
    const app = express();
    app.use(express.json());
    registerExportQueue(app, dir, "http://localhost", async () => {
      throw new Error("Esta prueba no debe renderizar");
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const rows = await fetch(base + "/api/export-queue").then((r) =>
        r.json(),
      );
      assert.equal(rows.length, 2);
      assert.equal(
        rows.find((b: { id: string }) => b.id === completed.id).status,
        "done",
      );
      const interrupted = rows.find((b: { id: string }) => b.id === pending.id);
      assert.equal(interrupted.status, "error");
      assert.match(interrupted.items[0].error, /reinició/);
      const file = await fetch(
        `${base}/api/export-queue/${completed.id}/file/${completed.items[0].id}`,
      );
      assert.equal(file.status, 200);
      assert.equal(await file.text(), "resultado");
      assert.equal(
        (
          await fetch(`${base}/api/export-queue/${completed.id}/cancel`, {
            method: "POST",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await fetch(`${base}/api/export-queue/${completed.id}/retry`, {
            method: "POST",
          })
        ).status,
        400,
        "una entrega histórica no pierde su archivo al cambiar los parámetros soportados",
      );
      assert.equal(fs.readFileSync(state, "utf8"), original);
      assert.ok(
        fs
          .readdirSync(path.join(dir, "export-jobs"))
          .some((f) => f.startsWith("queue-recuperacion-")),
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    const resolved = path.resolve(dir);
    if (
      resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith("ugc-queue-test-")
    )
      fs.rmSync(resolved, { recursive: true, force: true });
  }
});
