// Shared allowlist: client-supplied IDs never become arbitrary asset paths.
const CHARACTERS = [
  {id:'male-001', name:'Creative technologist', color:'#7c9f70'},
  {id:'male-002', name:'Formal strategist', color:'#4d9290'},
  {id:'male-003', name:'Hoodie engineer', color:'#769bd2'},
  {id:'male-004', name:'Creative producer', color:'#cd926d'},
  {id:'male-005', name:'Community lead', color:'#b0bf87'},
  {id:'female-001', name:'Biophilic designer', color:'#a4ad73'},
  {id:'female-002', name:'Operations manager', color:'#bb8fab'},
  {id:'female-003', name:'Product engineer', color:'#82abb5'},
  {id:'female-004', name:'Creative researcher', color:'#d39677'},
  {id:'female-005', name:'Community coordinator', color:'#8ab4a1'},
];
function characterById(id) { return CHARACTERS.find(c=>c.id===id) || CHARACTERS[0]; }
function spriteFrame(width, height, direction, column) {
  const row = direction === 'left' ? 1 : direction === 'right' ? 2 : 0;
  return {x:column*width/4, y:row*height/3, w:width/4, h:height/3};
}
Object.assign(globalThis, { CHARACTERS, characterById, spriteFrame });
