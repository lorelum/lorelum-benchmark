import { fetchProjects } from "./services/http";

// This wrapper deliberately forwards the HTTP response without a domain state.
export const requestRawProjects = (query: string) => fetchProjects(query);
