// Override the Next.js PageProps interface to match the runtime behavior
import "next";

declare module "next" {
  // Override the PageProps interface to match what Next.js actually provides at runtime
  export interface PageProps {
    params?: Record<string, string>;
    searchParams?: Record<string, string | string[]>;
  }
}
