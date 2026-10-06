"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getRole, getToken, setRole, setToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AskAnything from "@/components/student/AskAnything";
import Preflight from "@/components/student/Preflight";
import Technical from "@/components/student/Technical";
import Debrief from "@/components/student/Debrief";
import History from "@/components/student/History";
import Library from "@/components/student/Library";
import ExamPrep from "@/components/student/ExamPrep";

export default function StudentDashboard() {
  const router = useRouter();

  useEffect(() => {
    if (!getToken() || getRole() !== "student") router.push("/login?role=student");
  }, [router]);

  function logout() {
    setToken(null);
    setRole(null);
    router.push("/");
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Student Dashboard</h1>
        <Button variant="outline" onClick={logout}>Log out</Button>
      </div>
      <Tabs defaultValue="ask">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="ask">Ask Anything</TabsTrigger>
          <TabsTrigger value="preflight">Pre-flight</TabsTrigger>
          <TabsTrigger value="technical">Technical</TabsTrigger>
          <TabsTrigger value="debrief">Debrief</TabsTrigger>
          <TabsTrigger value="history">Flight History</TabsTrigger>
          <TabsTrigger value="library">Documentation Library</TabsTrigger>
          <TabsTrigger value="exam">Exam Prep</TabsTrigger>
        </TabsList>
        <TabsContent value="ask"><AskAnything /></TabsContent>
        <TabsContent value="preflight"><Preflight /></TabsContent>
        <TabsContent value="technical"><Technical /></TabsContent>
        <TabsContent value="debrief"><Debrief /></TabsContent>
        <TabsContent value="history"><History /></TabsContent>
        <TabsContent value="library"><Library /></TabsContent>
        <TabsContent value="exam"><ExamPrep /></TabsContent>
      </Tabs>
    </main>
  );
}
