import type { Metadata } from "next";
import { Landing } from "@/components/Landing";
import { OpenAuthOnMount } from "@/components/AuthDialog";

export const metadata: Metadata = { title: "Student sign up" };

export default function Page() {
  return (
    <>
      <Landing />
      <OpenAuthOnMount role="student" mode="signup" />
    </>
  );
}
