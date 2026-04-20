import Link from "next/link";
import { JoinRoomForm } from "@/components/JoinRoomForm";

export default function PlayLanding() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 py-10">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-mist/60">
          ← CrowdCircuit
        </Link>
      </header>
      <h1 className="text-3xl font-semibold">Join a room</h1>
      <p className="mt-2 text-sm text-mist/70">
        Grab the 4-letter code from the host&apos;s screen.
      </p>
      <div className="mt-6">
        <JoinRoomForm />
      </div>
    </main>
  );
}
