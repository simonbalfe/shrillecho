"use client";
import { useEffect } from "react";
import { useAppStore } from "@/store/app.store";
import { Welcome } from "./welcome";

interface AuthGateProps {
  children: React.ReactNode;
}

export const AuthGate = ({ children }: AuthGateProps) => {
  const { isLoading, hasSession, checkSession, registerAnonymousUser } =
    useAppStore();

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  if (!hasSession) {
    return (
      <Welcome isLoading={isLoading} registerAnomUser={registerAnonymousUser} />
    );
  }

  return <>{children}</>;
};
