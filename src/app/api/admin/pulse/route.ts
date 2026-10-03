import { pulseRoute } from "@/lib/api/pulse";
import { createQuiz, listAdminQuizzes } from "@/lib/pulse/quizzes";

export function GET(request: Request) {
  return pulseRoute(request, () => listAdminQuizzes(request));
}
export function POST(request: Request) {
  return pulseRoute(request, () => createQuiz(request));
}
