import { pulseRoute } from "@/lib/api/pulse";
import { getAdminQuiz } from "@/lib/pulse/quizzes";

export function GET(request: Request, context: { params: Promise<{ quizId: string }> }) {
  return pulseRoute(request, async () => getAdminQuiz(request, (await context.params).quizId));
}
