import type { Metadata } from "next";
import { Landing } from "@/components/Landing";
import { OpenAuthOnMount } from "@/components/AuthDialog";

export const metadata: Metadata = { title: "Teacher sign in" };

export default function Page() {
  return (
    <>
      <Landing />
      <OpenAuthOnMount role="teacher" mode="login" />
    </>
  );
}
