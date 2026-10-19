"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function BillingCancelPage() {
  return (
    <main className="auth-backdrop flex min-h-screen items-center justify-center p-8">
      <Card className="w-96">
        <CardHeader>
          <CardTitle>Checkout canceled</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            No subscription was started and no charge was made. If you cancel
            during the free trial, you are never charged.
          </p>
          <p className="text-sm text-muted-foreground">
            You can start your free trial at any time from the Billing page.
          </p>
          <Link href="/student"><Button className="w-full">Back to PilotMate</Button></Link>
          <Link href="/login"><Button variant="outline" className="w-full">Go to login</Button></Link>
        </CardContent>
      </Card>
    </main>
  );
}
