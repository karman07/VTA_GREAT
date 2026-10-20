import type { Metadata } from "next";
import { Landing } from "@/components/Landing";
import { OpenAuthOnMount } from "@/components/AuthDialog";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <>
      <Landing />
      <OpenAuthOnMount mode="login" />
    </>
  );
}
