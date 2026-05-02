import { get } from "./client";
import type { MenuTreeResponse } from "./types";

export function getMenuTree(): Promise<MenuTreeResponse> {
  return get<MenuTreeResponse>("/v1/menu/tree");
}
