export async function* readEvents(response:Response) {
 if(!response.body)throw new Error('Empty stream');
 const decoder=new TextDecoder();let buffer='';
 for await(const chunk of response.body as any){buffer+=decoder.decode(chunk,{stream:true});if(buffer.length>65536)throw new Error('Stream event too large');let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(line)yield JSON.parse(line);}}
 buffer+=decoder.decode();if(buffer.trim())yield JSON.parse(buffer);
}
