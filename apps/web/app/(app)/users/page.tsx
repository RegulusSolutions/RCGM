"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import { ROLE_LABELS, type UserRole } from "@/lib/types";

interface TenantUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  can_mark_paid: boolean;
}

interface Agent {
  id: string;
  name: string;
  is_active: boolean;
}

const ASSIGNABLE_ROLES = (Object.keys(ROLE_LABELS) as UserRole[]).filter((r) => r !== "SUPER_ADMIN");

export default function UsersPage() {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("COORDINATOR");
  const [agentId, setAgentId] = useState("");
  const [canMarkPaid, setCanMarkPaid] = useState(false);

  function load() {
    setLoading(true);
    apiFetch<TenantUser[]>("/api/users")
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    apiFetch<Agent[]>("/api/master-data/agents")
      .then(setAgents)
      .catch(() => setAgents([]));
  }, []);

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  function openAdd() {
    setUsername("");
    setPassword("");
    setName("");
    setRole("COORDINATOR");
    setAgentId("");
    setCanMarkPaid(false);
    setAddOpen(true);
  }

  async function submitAdd() {
    if (!username.trim() || !password.trim() || !name.trim()) {
      toast.error("Username, password and name are required.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/users", {
        method: "POST",
        json: {
          username: username.trim(),
          password,
          name: name.trim(),
          role,
          can_mark_paid: canMarkPaid,
          agent_id: role === "MARKETING" && agentId ? agentId : undefined,
        },
      });
      toast.success("User created");
      setAddOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create user.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: TenantUser) {
    try {
      await apiFetch(`/api/users/${u.id}/toggle-active`, { method: "POST" });
      toast.success(u.is_active ? "User deactivated" : "User reactivated");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update user.");
    }
  }

  async function toggleMarkPaid(u: TenantUser) {
    try {
      await apiFetch(`/api/users/${u.id}/toggle-mark-paid`, { method: "POST" });
      toast.success(u.can_mark_paid ? "Mark-Paid revoked" : "Mark-Paid granted");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update permission.");
    }
  }

  return (
    <div>
      <PageHead title="Users & Permissions" subtitle="Manage tenant users and the Mark-Paid grant" />

      <Panel
        title="Users"
        actions={
          <div className="flex items-center gap-2">
            <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
            <Button size="sm" onClick={openAdd}>
              + Add user
            </Button>
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Mark-Paid</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.username}</TableCell>
                <TableCell>{u.name}</TableCell>
                <TableCell>{ROLE_LABELS[u.role] ?? u.role}</TableCell>
                <TableCell>
                  <button
                    onClick={() => toggleMarkPaid(u)}
                    className={
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                      (u.can_mark_paid ? "bg-[#173B2C] text-[#3FBF7F]" : "bg-[#232F49] text-muted-foreground")
                    }
                  >
                    {u.can_mark_paid ? "Granted" : "Grant"}
                  </button>
                </TableCell>
                <TableCell>
                  <Badge variant={u.is_active ? "secondary" : "outline"}>{u.is_active ? "Active" : "Disabled"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="border-border" onClick={() => toggleActive(u)}>
                    {u.is_active ? "Deactivate" : "Reactivate"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Username *</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Password *</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Full name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v as UserRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {role === "MARKETING" && (
              <div className="space-y-1.5">
                <Label>Linked marketing agent</Label>
                <Select value={agentId} onValueChange={(v) => v && setAgentId(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="— none —" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.filter((a) => a.is_active).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={canMarkPaid} onChange={(e) => setCanMarkPaid(e.target.checked)} />
              Grant Mark-Paid permission
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={submitAdd}>
              {saving ? "Saving…" : "Create user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
