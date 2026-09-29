import readline from "node:readline";
console.log(JSON.stringify({type:"ready"}));
readline.createInterface({ input:process.stdin }).on("line", line => {
  const request = JSON.parse(line);
  if (request.text === "hang") return;
  if (request.text === "crash") process.exit(1);
  if (request.text === "malformed") { console.log("not json"); return; }
  if (request.warmup) { console.log(JSON.stringify({id:request.id,type:"done"})); return; }
  const wav = Buffer.alloc(46);
  wav.write("RIFF"); wav.writeUInt32LE(38, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(24000,24); wav.writeUInt32LE(48000,28); wav.writeUInt16LE(2,32);
  wav.writeUInt16LE(16,34); wav.write("data",36); wav.writeUInt32LE(2,40);
  console.log(JSON.stringify({id:request.id,type:"audio",data:wav.toString("base64")}));
  console.log(JSON.stringify({id:request.id,type:"done"}));
});
