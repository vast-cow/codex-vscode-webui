// Use an explicit transport tree so application objects cannot collide with tags.
function pack(v) {
  if (v === undefined) return ['u'];
  if (v instanceof Uint8Array) return ['b', Buffer.from(v).toString('base64')];
  if (v instanceof ArrayBuffer) return ['b', Buffer.from(v).toString('base64')];
  if (Array.isArray(v)) return ['a', v.map(pack)];
  if (v !== null && typeof v === 'object') return ['o', Object.entries(v).map(([k,x])=>[k,pack(x)])];
  return ['v',v];
}
function unpack(v) {
  switch(v[0]) {
    case 'u': return undefined;
    case 'b': return Uint8Array.from(Buffer.from(v[1],'base64'));
    case 'a': return v[1].map(unpack);
    case 'o': return Object.fromEntries(v[1].map(([k,x])=>[k,unpack(x)]));
    case 'v': return v[1];
    default: throw Error('Invalid transport value');
  }
}
module.exports={pack,unpack};
