import { useEffect, useRef, type ReactNode } from "react";
import {createPortal} from "react-dom";
import {useUiDocument} from "./UiDocument";
export function ActionDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  const uiDoc=useUiDocument();
  useEffect(()=>{const previous=uiDoc.activeElement as HTMLElement|null;ref.current?.showModal();return()=>{if(previous?.isConnected)previous.focus();};},[uiDoc]);
  return createPortal(<dialog ref={ref} className="command-dialog" aria-label={title} data-command-ui onCancel={e=>{e.preventDefault();onClose();}}><h2>{title}</h2>{children}</dialog>,uiDoc.body);
}
