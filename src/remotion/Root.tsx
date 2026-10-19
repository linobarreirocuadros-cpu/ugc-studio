import { Composition } from "remotion";
import { createEmptyProject, getProjectDuration } from "../project/types";
import { ProjectComposition, type CompositionProps } from "./ProjectComposition";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Project"
    component={ProjectComposition}
    defaultProps={{ project: createEmptyProject() } satisfies CompositionProps}
    calculateMetadata={({ props }) => ({
      durationInFrames: getProjectDuration(props.project),
      fps: props.project.fps,
      width: props.project.width,
      height: props.project.height,
    })}
  />
);
