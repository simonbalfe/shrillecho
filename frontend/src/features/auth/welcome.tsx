"use client";
import { FC } from "react";

interface WelcomeProps {
  isLoading: boolean;
  registerAnomUser: () => void;
}

export const Welcome: FC<WelcomeProps> = ({ isLoading, registerAnomUser }) => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="mb-6 text-3xl font-bold text-gray-900">
          Welcome to Playlist Miner
        </h1>
        <button
          onClick={registerAnomUser}
          disabled={isLoading}
          className="rounded-lg bg-blue-600 px-6 py-3 text-white shadow-lg hover:bg-blue-700 disabled:bg-blue-400"
        >
          {isLoading ? "Processing..." : "Create Anonymous Account"}
        </button>
      </div>
    </div>
  );
};

