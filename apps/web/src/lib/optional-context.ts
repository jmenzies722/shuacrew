export function optionalContext(source: Promise<string>, milliseconds: number): Promise<string> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(""), milliseconds);
    source.then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(""); });
  });
}
