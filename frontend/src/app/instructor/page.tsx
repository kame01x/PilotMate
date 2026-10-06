"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getRole, getToken, setRole, setToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LinkStudent from "@/components/instructor/LinkStudent";
import Messages from "@/components/instructor/Messages";
import PreflightTool from "@/components/instructor/PreflightTool";

export default function InstructorDashboard() {
  const router = useRouter();

  useEffect(() => {
    if (!getToken() || getRole() !== "instructor") router.push("/login?role=instructor");
  }, [router]);

  function logout() {
    setToken(null);
    setRole(null);
    router.push("/");
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Instructor Dashboard</h1>
        <Button variant="outline" onClick={logout}>Log out</Button>
      </div>
      <Tabs defaultValue="link">
        <TabsList>
          <TabsTrigger value="link">Link Student</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="preflight">Pre-flight Agent</TabsTrigger>
        </TabsList>
        <TabsContent value="link"><LinkStudent onLinked={() => {}} /></TabsContent>
        <TabsContent value="messages"><Messages /></TabsContent>
        <TabsContent value="preflight"><PreflightTool /></TabsContent>
      </Tabs>
    </main>
  );
}
