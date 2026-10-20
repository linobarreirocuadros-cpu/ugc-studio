/** Una respuesta pendiente no puede editar otro documento o secuencia recién abierta. */
export function guardAssistantSession<T extends object>(context:T,isCurrent:()=>boolean):T {
  return Object.fromEntries(Object.entries(context).map(([key,value])=>[key,typeof value==="function"?(...args:unknown[])=>{
    if(!isCurrent())throw new Error("Cambiaste de proyecto o secuencia. Repite la petición en el montaje actual.");
    return value(...args);
  }:value])) as T;
}
