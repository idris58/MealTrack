import { useState } from "react";
import { useLocation } from "wouter";
import { Settings2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

export function MessSettingsCard() {
  const { profile, canManageMess } = useAuth();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canManageMess || !profile?.mess_id) return null;

  const saveName = async () => {
    if (!name.trim() || working) return;
    setWorking(true); setError(null); setMessage(null);
    const { error: rpcError } = await supabase.rpc("update_mess_settings", { mess_name: name.trim() });
    if (rpcError) setError(rpcError.message); else { setMessage("Mess name updated."); setName(""); }
    setWorking(false);
  };

  const deleteMess = async () => {
    setWorking(true); setError(null);
    const { error: rpcError } = await supabase.rpc("delete_current_mess");
    if (rpcError) { setError(rpcError.message); setWorking(false); return; }
    setLocation("/app/onboarding");
    window.location.reload();
  };

  return <Card className="border-destructive/30"><CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" />Mess settings</CardTitle><CardDescription>Manager-only mess administration.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="flex gap-2"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New mess name" /><Button disabled={!name.trim() || working} onClick={() => void saveName()}>Save</Button></div><div className="rounded-lg border border-destructive/30 p-4"><p className="font-medium text-destructive">Delete this mess</p><p className="mt-1 text-sm text-muted-foreground">This permanently deletes all members, cycles, meals, expenses, deposits, and history in this mess.</p><AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" className="mt-3" disabled={working}><Trash2 className="h-4 w-4" />Delete mess</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this mess permanently?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void deleteMess()}>Delete permanently</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>{message ? <p className="text-sm text-emerald-600">{message}</p> : null}{error ? <p className="text-sm text-destructive">{error}</p> : null}</CardContent></Card>;
}
