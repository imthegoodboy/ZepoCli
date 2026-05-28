export function promptContext(): { output: NodeJS.WritableStream; clearPromptOnDone: boolean } {
  return {
    output: process.stderr,
    clearPromptOnDone: false
  };
}
