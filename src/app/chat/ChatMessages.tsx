export type UiMessage={role:"user"|"assistant"|"action"|"failed"|"error"|"status";text:string};

/** La actividad técnica se conserva por turno; los errores siguen siempre visibles. */
export function ChatMessages({messages}:{messages:UiMessage[]}) {
  const turns:{user?:UiMessage;replies:UiMessage[];actions:UiMessage[]}[]=[];
  for(const message of messages) {
    if(message.role==="status")continue;
    if(message.role==="user")turns.push({user:message,replies:[],actions:[]});
    else {
      if(!turns.length)turns.push({replies:[],actions:[]});
      const turn=turns[turns.length-1];
      (message.role==="action"?turn.actions:turn.replies).push(message);
    }
  }
  return turns.map((turn,index)=><div className="assistant-turn" key={index}>
    {turn.user&&<div className="chat-msg user">{turn.user.text}</div>}
    {turn.replies.map((m,i)=><div key={i} className={`chat-msg ${m.role}`} role={m.role==="error"||m.role==="failed"?"alert":undefined}>{m.text}</div>)}
    {!!turn.actions.length&&<details className="assistant-activity"><summary>Ver actividad ({turn.actions.length})</summary>{turn.actions.map((m,i)=><div className="chat-msg action" key={i}>{m.text}</div>)}</details>}
  </div>);
}
