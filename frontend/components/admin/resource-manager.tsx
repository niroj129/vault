"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorText, fieldErrors, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export type FieldType = "text" | "textarea" | "number" | "email" | "url" | "date" | "password" | "select" | "checkbox" | "image";
export interface FieldDef {
  name: string; label: string; type?: FieldType; required?: boolean; help?: string; full?: boolean;
  options?: { value: string; label: string }[]; rows?: number; min?: number; max?: number; placeholder?: string;
  /** required when adding, optional when editing (passwords) */
  requiredOnCreate?: boolean;
}
export interface ColumnDef<T> { key: string; label: string; render?: (row: T) => ReactNode; className?: string; mobileHidden?: boolean }
type Row = { id: number | string };
const get = (row: unknown, key: string) => (row as Record<string, unknown>)[key];

/** zod schema generated from the field list: required, email, url, number and length rules. */
function schemaFor(fields: FieldDef[], editing: boolean) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (f.type === "image") { shape[f.name] = z.any().optional(); continue; }
    if (f.type === "checkbox") { shape[f.name] = z.boolean(); continue; }
    const need = f.required || (f.requiredOnCreate && !editing);
    let s: z.ZodTypeAny = z.string().trim();
    if (f.type === "email") s = z.string().trim().refine((v) => !v || z.email().safeParse(v).success, "That email doesn't look right.");
    if (f.type === "url") s = z.string().trim().refine((v) => !v || /^https?:\/\/\S+$/.test(v), "Use a full link starting with https://");
    if (f.type === "number") {
      s = z.string().trim().refine((v) => !v || !Number.isNaN(Number(v)), "Enter a number.")
        .refine((v) => !v || f.min === undefined || Number(v) >= f.min, `Must be ${f.min} or more.`)
        .refine((v) => !v || f.max === undefined || Number(v) <= f.max, `Must be ${f.max} or less.`);
    }
    if (need) s = (s as z.ZodString).refine((v: string) => v.length > 0, `${f.label} is required.`);
    shape[f.name] = s;
  }
  return z.object(shape);
}

function ImageField({ value, file, onFile, id }: { value?: string | null; file?: File | null; onFile: (f: File) => void; id: string }) {
  const [preview, setPreview] = useState("");
  useEffect(() => { if (!file) { setPreview(""); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);
  const src = preview || (value ? mediaUrl(value) : "");
  return (
    <label htmlFor={id} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed p-2 transition-colors duration-150 hover:border-ring/60 hover:bg-accent focus-within:outline-2 focus-within:outline-ring">
      <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
        {src ? <Image src={src} alt="" fill sizes="56px" unoptimized={!!preview} className="object-cover" /> : <ImagePlus className="size-5 text-muted-foreground" aria-hidden />}
      </span>
      <span className="grid text-sm"><b>{file ? file.name : src ? "Replace image" : "Upload image"}</b><span className="text-muted-foreground">PNG, JPG or WebP</span></span>
      <input id={id} type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </label>
  );
}

export function ResourceForm({ fields, initial, editing, onSubmit, submitLabel, onCancel }: {
  fields: FieldDef[]; initial: Record<string, unknown>; editing: boolean; submitLabel: string; onCancel: () => void;
  onSubmit: (values: Record<string, unknown>, files: Record<string, File>) => Promise<Record<string, string> | void>;
}) {
  const schema = useMemo(() => schemaFor(fields, editing), [fields, editing]);
  const defaults = useMemo(() => Object.fromEntries(fields.map((f) => [f.name,
    f.type === "checkbox" ? !!initial[f.name] : f.type === "image" ? undefined : initial[f.name] === null || initial[f.name] === undefined ? "" : String(initial[f.name])])), [fields, initial]);
  const form = useForm<Record<string, unknown>>({ resolver: zodResolver(schema), defaultValues: defaults });
  const [files, setFiles] = useState<Record<string, File>>({});
  const { errors, isSubmitting } = form.formState;
  const err = (n: string) => errors[n]?.message as string | undefined;

  async function submit(v: Record<string, unknown>) {
    const fe = await onSubmit(v, files);
    if (fe) {
      Object.entries(fe).forEach(([k, m]) => form.setError(fields.some((f) => f.name === k) ? k : "root", { message: m }));
    }
  }
  return (
    <form noValidate onSubmit={form.handleSubmit(submit)}>
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `rf-${f.name}`;
          const full = f.full || f.type === "textarea" || f.type === "image";
          if (f.type === "checkbox") {
            return (
              <Controller key={f.name} control={form.control} name={f.name} render={({ field }) => (
                <Field orientation="horizontal" className={cn("min-h-11", full && "sm:col-span-2")}>
                  <Checkbox id={id} checked={!!field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                  <FieldLabel htmlFor={id} className="font-normal">{f.label}</FieldLabel>
                </Field>
              )} />
            );
          }
          return (
            <Field key={f.name} data-invalid={!!err(f.name)} className={cn(full && "sm:col-span-2")}>
              <FieldLabel htmlFor={id}>{f.label}{!f.required && !(f.requiredOnCreate && !editing) && <span className="font-normal text-muted-foreground"> (optional)</span>}</FieldLabel>
              {f.type === "textarea" ? <Textarea id={id} rows={f.rows || 3} aria-invalid={!!err(f.name)} placeholder={f.placeholder} {...form.register(f.name)} />
                : f.type === "select" ? (
                  <Controller control={form.control} name={f.name} render={({ field }) => (
                    <Select value={String(field.value ?? "") || "__none"} onValueChange={(v) => field.onChange(v === "__none" ? "" : v)}>
                      <SelectTrigger id={id} className="w-full" aria-invalid={!!err(f.name)}><SelectValue /></SelectTrigger>
                      <SelectContent>{(f.options || []).map((o) => <SelectItem key={o.value || "__none"} value={o.value || "__none"}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                ) : f.type === "image" ? <ImageField id={id} value={initial[f.name] as string | null} file={files[f.name]} onFile={(x) => setFiles((s) => ({ ...s, [f.name]: x }))} />
                : <Input id={id} type={f.type === "number" ? "number" : f.type || "text"} inputMode={f.type === "number" ? "decimal" : undefined} step={f.type === "number" ? "any" : undefined}
                    autoComplete={f.type === "password" ? "new-password" : "off"} placeholder={f.placeholder} aria-invalid={!!err(f.name)} {...form.register(f.name)} />}
              {f.help && <FieldDescription>{f.help}</FieldDescription>}
              <FieldError>{err(f.name)}</FieldError>
            </Field>
          );
        })}
      </FieldGroup>
      {errors.root && <p role="alert" className="mt-4 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive-text">{errors.root.message as string}</p>}
      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>{isSubmitting ? "Saving…" : submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}

interface Props<T extends Row> {
  title: string; itemName: string; endpoint: string; columns: ColumnDef<T>[]; fields: FieldDef[];
  /** extra buttons per row, e.g. a dialog; call the second argument to reload the list */
  rowActions?: (row: T, reload: () => void) => ReactNode;
  defaults?: Record<string, unknown>; addLabel?: string; canAdd?: boolean; canEdit?: boolean; canDelete?: boolean;
  searchKeys?: (keyof T & string)[]; describeDelete?: (row: T) => string; lookupKey?: keyof T & string;
  renderList?: (rows: T[], api: { edit: (row: T) => void; remove: (row: T) => void; reload: () => void }) => ReactNode;
  filterRows?: (rows: T[]) => T[]; toolbar?: (rows: T[]) => ReactNode; reloadKey?: number; emptyText?: string;
}

/** List + add/edit/delete for one API collection (shadcn Table on desktop, cards on phones). */
export function ResourceManager<T extends Row>({
  title, itemName, endpoint, columns, fields, defaults = {}, addLabel, canAdd = true, canEdit = true, canDelete = true,
  searchKeys, describeDelete, lookupKey = "id" as keyof T & string, renderList, filterRows, toolbar, reloadKey = 0, emptyText, rowActions,
}: Props<T>) {
  const { token } = useAuth();
  const [rows, setRows] = useState<T[] | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ row: T | null; data: Record<string, unknown> } | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const hasFiles = fields.some((f) => f.type === "image");

  const load = useCallback(() => {
    apiFetch<T[] | { results: T[] }>(endpoint, { token }).then((r) => setRows(Array.isArray(r) ? r : r.results)).catch((e) => { toast.error(errorText(e)); setRows([]); });
  }, [endpoint, token]);
  useEffect(() => { if (token) load(); }, [token, load, reloadKey]);

  async function openEdit(row: T) {
    let full = row as unknown as Record<string, unknown>;
    try { full = await apiFetch<Record<string, unknown>>(`${endpoint}${String(get(row, lookupKey))}/`, { token }); } catch { /* use the list row */ }
    setEditing({ row, data: full });
  }
  async function save(values: Record<string, unknown>, files: Record<string, File>) {
    const isEdit = !!editing?.row;
    const path = isEdit ? `${endpoint}${String(get(editing!.row, lookupKey))}/` : endpoint;
    try {
      let body: FormData | Record<string, unknown>;
      if (hasFiles && Object.keys(files).length) {
        const fd = new FormData();
        fields.forEach((f) => {
          if (f.type === "image") { if (files[f.name]) fd.append(f.name, files[f.name]); return; }
          const v = values[f.name];
          if (f.type === "checkbox") fd.append(f.name, v ? "true" : "false");
          else if (v !== "" && v !== undefined && v !== null) fd.append(f.name, String(v));
        });
        body = fd;
      } else {
        body = Object.fromEntries(fields.filter((f) => f.type !== "image").map((f) => [f.name, values[f.name] === "" && f.type === "select" ? null : values[f.name]])
          .filter(([k, v]) => !(fields.find((f) => f.name === k)?.type === "password" && !v)));
      }
      await apiFetch(path, { method: isEdit ? "PATCH" : "POST", token, body });
      toast.success(isEdit ? `${itemName} saved` : `${itemName} added`);
      setEditing(null); load();
    } catch (e) {
      const fe = fieldErrors(e);
      return Object.keys(fe).length ? fe : { root: errorText(e) };
    }
  }
  async function confirmDelete() {
    if (!deleting) return;
    try { await apiFetch(`${endpoint}${String(get(deleting, lookupKey))}/`, { method: "DELETE", token }); toast.success(`${itemName} deleted`); load(); }
    catch (e) { toast.error(errorText(e)); } finally { setDeleting(null); }
  }

  const q = query.trim().toLowerCase();
  const searched = rows && searchKeys && q ? rows.filter((r) => searchKeys.some((k) => String(get(r, k) ?? "").toLowerCase().includes(q))) : rows;
  const visible = searched && filterRows ? filterRows(searched) : searched;
  const actions = (row: T) => (
    <div className="flex justify-end gap-1">
      {rowActions?.(row, load)}
      {canEdit && <Button variant="ghost" size="icon-sm" onClick={() => void openEdit(row)} aria-label={`Edit ${itemName.toLowerCase()}`}><Pencil aria-hidden /></Button>}
      {canDelete && <Button variant="ghost" size="icon-sm" className="text-destructive-text hover:text-destructive-text" onClick={() => setDeleting(row)} aria-label={`Delete ${itemName.toLowerCase()}`}><Trash2 aria-hidden /></Button>}
    </div>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {toolbar && rows ? toolbar(rows) : <p className="text-sm text-muted-foreground" aria-live="polite">{visible ? `${visible.length} ${title.toLowerCase()}` : ""}</p>}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {searchKeys && (
            <InputGroup className="flex-1 sm:w-64">
              <InputGroupAddon><Search aria-hidden /></InputGroupAddon>
              <InputGroupInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label={`Search ${title.toLowerCase()}`} />
            </InputGroup>
          )}
          {canAdd && <Button onClick={() => setEditing({ row: null, data: defaults })}><Plus aria-hidden />{addLabel || `Add ${itemName.toLowerCase()}`}</Button>}
        </div>
      </div>

      {visible === null ? <Skeleton className="h-64 rounded-xl" /> : renderList ? renderList(visible, { edit: (r) => void openEdit(r), remove: setDeleting, reload: load }) : !visible.length ? (
        <Empty className="border"><EmptyHeader><EmptyTitle>Nothing here yet</EmptyTitle><EmptyDescription>{emptyText || `Add your first ${itemName.toLowerCase()} to get started.`}</EmptyDescription></EmptyHeader>
          {canAdd && <EmptyContent><Button onClick={() => setEditing({ row: null, data: defaults })}><Plus aria-hidden />{addLabel || `Add ${itemName.toLowerCase()}`}</Button></EmptyContent>}</Empty>
      ) : (
        <>
          <Card className="glass hidden py-0 md:block">
            <Table>
              <caption className="sr-only">{title}</caption>
              <TableHeader><TableRow>{columns.map((c) => <TableHead key={c.key} className={cn("first:pl-4", c.className)}>{c.label}</TableHead>)}
                {(canEdit || canDelete) && <TableHead className="pr-4 text-right"><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={String(row.id)}>
                    {columns.map((c) => <TableCell key={c.key} className={cn("first:pl-4", c.className)}>{c.render ? c.render(row) : String(get(row, c.key) ?? "—")}</TableCell>)}
                    {(canEdit || canDelete) && <TableCell className="pr-4">{actions(row)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <ul className="grid gap-2 md:hidden" aria-label={title}>
            {visible.map((row) => (
              <li key={String(row.id)}>
                <Card className="glass gap-2 px-4 py-3">
                  <dl className="grid gap-1.5">
                    {columns.filter((c) => !c.mobileHidden).map((c) => (
                      <div key={c.key} className="flex items-start justify-between gap-3 text-sm"><dt className="text-muted-foreground">{c.label}</dt>
                        <dd className="min-w-0 text-right">{c.render ? c.render(row) : String(get(row, c.key) ?? "—")}</dd></div>
                    ))}
                  </dl>
                  {(canEdit || canDelete) && <div className="border-t pt-2">{actions(row)}</div>}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.row ? `Edit ${itemName.toLowerCase()}` : addLabel || `Add ${itemName.toLowerCase()}`}</DialogTitle>
            <DialogDescription>{editing?.row ? "Change the details and save." : "Fill in the details below."}</DialogDescription></DialogHeader>
          {editing && <ResourceForm fields={fields} initial={editing.data} editing={!!editing.row} submitLabel={editing.row ? "Save changes" : addLabel || "Add"}
            onCancel={() => setEditing(null)} onSubmit={save} />}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this {itemName.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>{deleting && describeDelete ? describeDelete(deleting) : "This can't be undone."}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
