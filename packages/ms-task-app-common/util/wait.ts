export async function wait(delay: number) {
  await new Promise(res => setTimeout(res, delay))
}
