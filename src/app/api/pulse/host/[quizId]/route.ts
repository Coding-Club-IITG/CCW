import { pulseRoute } from "@/lib/api/pulse";
import { getHostQuiz } from "@/lib/pulse/quizzes";

export function GET(request: Request, context: { params: Promise<{ quizId: string }> }) {
  return pulseRoute(request, async () => getHostQuiz(request, (await context.params).quizId));
}
