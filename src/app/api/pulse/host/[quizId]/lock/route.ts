import { pulseRoute } from "@/lib/api/pulse";
import { acquireLock, releaseLock } from "@/lib/pulse/editorLockApi";

type Context = { params: Promise<{ quizId: string }> };

export function POST(request: Request, context: Context) {
  return pulseRoute(request, async () => acquireLock(request, (await context.params).quizId));
}
export function DELETE(request: Request, context: Context) {
  return pulseRoute(request, async () => releaseLock(request, (await context.params).quizId));
}
