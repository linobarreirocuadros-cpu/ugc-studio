import {createContext,useContext} from "react";
export const UiDocument=createContext<Document|null>(typeof document==="undefined"?null:document);
export const useUiDocument=()=>useContext(UiDocument)??document;
