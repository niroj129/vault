"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";

interface Log { id: number; user: string; role: string; ip: string; user_agent: string; at: string }

export default function AdminLogins() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<Log[] | null>(null);
  useEffect(() => { if (token) apiFetch<Log[]>("/auth/logins/", { token }).then(setLogs).catch(() => setLogs([])); }, [token]);
  return (
    <div className="grid gap-6">
      <PageHeader title="Login activity" description="Recent sign-ins (security log)." />
      {logs === null ? <Skeleton className="h-64 rounded-xl" /> : !logs.length ? (
        <Empty className="border"><EmptyHeader><EmptyTitle>No sign-ins recorded yet</EmptyTitle></EmptyHeader></Empty>
      ) : (
        <>
          <Card className="glass hidden py-0 md:block">
            <Table>
              <caption className="sr-only">Recent sign-ins</caption>
              <TableHeader><TableRow><TableHead className="pl-4">User</TableHead><TableHead>Role</TableHead><TableHead>IP</TableHead><TableHead>Device</TableHead><TableHead className="pr-4">When</TableHead></TableRow></TableHeader>
              <TableBody>{logs.map((l) => (
                <TableRow key={l.id}><TableCell className="pl-4 font-semibold">{l.user}</TableCell><TableCell><Badge variant={l.role === "admin" ? "default" : "secondary"}>{l.role}</Badge></TableCell>
                  <TableCell className="font-mono text-sm">{l.ip || "—"}</TableCell><TableCell className="max-w-xs truncate text-sm text-muted-foreground" title={l.user_agent}>{l.user_agent || "—"}</TableCell>
                  <TableCell className="pr-4 text-sm text-muted-foreground">{dateTime(l.at)}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          </Card>
          <ul className="grid gap-2 md:hidden">{logs.map((l) => (
            <li key={l.id}><Card className="glass gap-1 px-4 py-3 text-sm"><div className="flex justify-between"><b>{l.user}</b><Badge variant="secondary">{l.role}</Badge></div>
              <span className="font-mono">{l.ip || "—"}</span><span className="text-muted-foreground">{dateTime(l.at)}</span></Card></li>
          ))}</ul>
        </>
      )}
    </div>
  );
}
