export type TextPart = {kind:'text'|'bold'|'italic'|'strike'|'code'|'link'|'mention';text:string};
export function tokenizeMessage(text:string):TextPart[] {
 const pattern=/https?:\/\/[^\s<>]+|@[\d]{9,16}|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~|`([^`\n]+)`/g;
 const result:TextPart[]=[]; let last=0; let match;
 while((match=pattern.exec(text))) {
  if(match.index>last) result.push({kind:'text',text:text.slice(last,match.index)});
  const raw=match[0];
  const kind=raw.startsWith('http')?'link':raw.startsWith('@')?'mention':raw[0]==='*'?'bold':raw[0]==='_'?'italic':raw[0]==='~'?'strike':'code';
  if(kind==='link') {
   const trimmed=raw.replace(/[.,;!?)]+$/,'');
   result.push({kind,text:trimmed});
   if(trimmed!==raw) result.push({kind:'text',text:raw.slice(trimmed.length)});
  } else result.push({kind,text:kind==='mention'?raw:raw.slice(1,-1)});
  last=pattern.lastIndex;
 }
 if(last<text.length) result.push({kind:'text',text:text.slice(last)});
 return result;
}
