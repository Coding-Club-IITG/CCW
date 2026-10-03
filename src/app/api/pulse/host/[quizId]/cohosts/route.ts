import { pulseRoute } from "@/lib/api/pulse";
import { changeCoHost } from "@/lib/pulse/quizzes";

type Context = { params: Promise<{ quizId: string }> };
export function POST(request: Request, context: Context) {
  return pulseRoute(request, async () => changeCoHost(request, (await context.params).quizId, "add"));
}
export function DELETE(request: Request, context: Context) {
  return pulseRoute(request, async () => changeCoHost(request, (await context.params).quizId, "remove"));
}
