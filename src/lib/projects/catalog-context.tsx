"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { createProjectCatalog } from "./catalog";
import type { ProjectCatalog } from "./types";

const ProjectCatalogContext = createContext<ProjectCatalog | null>(null);
const ProjectAccountIdContext = createContext<string | null>(null);

export function ProjectCatalogProvider({
  accountId,
  children,
}: {
  accountId: string | null;
  children: ReactNode;
}) {
  const catalog = useMemo(
    () => createProjectCatalog({ accountId }),
    [accountId],
  );
  return (
    <ProjectAccountIdContext.Provider value={accountId}>
      <ProjectCatalogContext.Provider value={catalog}>
        {children}
      </ProjectCatalogContext.Provider>
    </ProjectAccountIdContext.Provider>
  );
}

export function useProjectAccountId(): string | null {
  return useContext(ProjectAccountIdContext);
}

export function useProjectCatalog(): ProjectCatalog {
  const catalog = useContext(ProjectCatalogContext);
  if (!catalog) {
    throw new Error("Project catalog requires an application boundary.");
  }
  return catalog;
}
