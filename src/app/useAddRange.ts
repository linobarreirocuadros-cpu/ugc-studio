import {useEffect,useRef,useState} from "react";
import {createAddRangeGesture,type AddRange,type AddRangeOptions} from "./addRangeGesture";

export function useAddRange(options:AddRangeOptions){
  const [range,setRange]=useState<AddRange|null>(null),latest=useRef(options);
  latest.current=options;
  const controller=useRef<ReturnType<typeof createAddRangeGesture>|null>(null);
  if(!controller.current)controller.current=createAddRangeGesture(()=>latest.current,setRange);
  useEffect(()=>()=>controller.current?.destroy(),[]);
  return {...controller.current,range};
}
