"use client";

import { templateConfig } from "@template/config";
import { useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TaskFilterNav } from "@/features/tasks/components/task-filter";
import { TaskForm } from "@/features/tasks/components/task-form";
import { TaskItem } from "@/features/tasks/components/task-item";
import { SignInForm } from "@/modules/auth/components/sign-in-form"; // @auth-module
import { SAMPLE_TASKS } from "./sample-data";

const noop = () => {};

/**
 * One screen of a believable app (header, the Tasks page, a side panel) built from the real
 * components, so a style can be judged as a whole rather than component by component. The style
 * switcher on /styleguide/compare renders it inside the chosen candidate's scope. Task rows and
 * the filter are inert (their dialogs and links would leave the scope); the add-task form is live
 * and writes to the dev database if submitted.
 */
export function ExampleAppScreen({ id }: { id: string }) {
  const scope = useRef<HTMLDivElement>(null);
  const field = (name: string) => `${id}-example-${name}`;

  return (
    <div ref={scope} className="overflow-hidden rounded-xl border-ui border-border bg-background shadow-surface">
      <div className="flex h-14 items-center gap-6 border-b-(length:--border-width) border-border px-4 sm:px-6">
        <span className="font-heading font-semibold tracking-tight">{templateConfig.name}</span>
        <div className="hidden items-center gap-4 text-muted-foreground text-sm sm:flex">
          <span className="font-medium text-foreground">Tasks</span>
          <span>Calendar</span>
          <span>Settings</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary">2 due</Badge>
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-xs"
          >
            AL
          </span>
        </div>
      </div>

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl">Tasks</h2>
            <p className="text-muted-foreground text-sm">Capture what needs doing, then check it off.</p>
          </div>
          <Card>
            <CardContent>
              <TaskForm mode="create" />
            </CardContent>
          </Card>
          <div className="flex flex-col gap-4" inert>
            <TaskFilterNav current="all" counts={{ all: 3, active: 2, done: 1 }} />
            <ul className="divide-y divide-border">
              {SAMPLE_TASKS.map((task) => (
                <TaskItem key={task.id} task={{ ...task, id: `${id}-${task.id}` }} onToggle={noop} onDelete={noop} />
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>This week</CardTitle>
              <CardDescription>2 tasks left, 1 done.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div
                role="progressbar"
                aria-label="Tasks done this week"
                aria-valuenow={33}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full w-1/3 rounded-full bg-primary" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>Launch</Badge>
                <Badge variant="outline">Venue</Badge>
                <Badge variant="destructive">1 overdue</Badge>
              </div>
            </CardContent>
            <CardFooter className="flex-wrap gap-2">
              <Dialog>
                <DialogTrigger render={<Button variant="outline" size="sm" />}>Clear done</DialogTrigger>
                <DialogContent container={scope}>
                  <DialogHeader>
                    <DialogTitle>Clear 1 done task?</DialogTitle>
                    <DialogDescription>This can't be undone.</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                    <DialogClose render={<Button variant="destructive" />}>Clear done</DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button size="sm">Plan the week</Button>
            </CardFooter>
          </Card>

          <Alert>
            <AlertTitle>Due Thursday</AlertTitle>
            <AlertDescription>Draft the launch announcement.</AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Reminders</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={field("time")}>Remind me at</FieldLabel>
                  <Input id={field("time")} name="time" type="time" defaultValue="09:00" />
                  <FieldDescription>In your local time.</FieldDescription>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox id={field("email")} defaultChecked />
                  <FieldLabel htmlFor={field("email")}>Email me the day before</FieldLabel>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// @auth-module:start
/** The sign-in screen as a new visitor first sees it. The form is live (it talks to Neon Auth). */
export function ExampleSignInScreen() {
  return (
    <div className="flex justify-center rounded-xl border-ui border-border bg-background px-4 py-16 shadow-surface">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to {templateConfig.name}</CardTitle>
          <CardDescription>New here? Signing in creates your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm next="/" />
        </CardContent>
      </Card>
    </div>
  );
}
// @auth-module:end
