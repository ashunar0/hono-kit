import { hc } from "hono/client";
import type { ApiApp } from "./index";

const client = hc<ApiApp>("/");

export async function get() {
  const res = await client.notes[":id"].$get({ param: { id: "x" } });

  if (res.status === 200) {
    const body = await res.json();
    body.createdAt satisfies number;
  }
  // param の検査があるので 400 が宣言される
  if (res.status === 400) {
    const body = await res.json();
    body.error.code satisfies "VALIDATION_ERROR";
  }
  // auth が requireAuth なので 401 が宣言される
  if (res.status === 401) {
    const body = await res.json();
    body.error.code satisfies "UNAUTHORIZED";
  }
  if (res.status === 404) {
    const body = await res.json();
    body.error.code satisfies "NOT_FOUND";
  }
  // @ts-expect-error 409 は宣言していないので比べられない
  if (res.status === 409) return;
}

export async function create() {
  const res = await client.notes.$post();

  if (res.status === 200) {
    const body = await res.json();
    body.id satisfies string;
  }
  // @ts-expect-error 入力が無いので 400 は宣言されない
  if (res.status === 400) return;
  // @ts-expect-error 作るときは 404 を宣言していない
  if (res.status === 404) return;
}

export async function statuses() {
  const res = await client.statuses.$post({ json: { kind: "taken" } });

  if (res.status === 409) {
    const body = await res.json();
    // 409 は 3 つ。同じ番号でも全部が型に出る
    body.error.code satisfies "TAKEN" | "STARTING" | "OVER_LIMIT";
    // code で分けると、その失敗の details の形が決まる
    if (body.error.code === "OVER_LIMIT") body.error.details.limit satisfies number;
    // @ts-expect-error details を宣言していない失敗には details が無い
    if (body.error.code === "TAKEN") void body.error.details;
  }
  if (res.status === 502) {
    const body = await res.json();
    body.error.code satisfies "UPSTREAM_FAILED";
  }

  // @ts-expect-error kind は taken / starting / over / upstream だけ
  await client.statuses.$post({ json: { kind: "unknown" } });
}

export async function catchAll() {
  const res = await client.files[":path{.+}"].$get({ param: { path: "a/b" } });

  if (res.status === 200) {
    const body = await res.json();
    body.path satisfies string;
  }
}

// リダイレクトは 303 で、本文が無い
export async function redirects() {
  const res = await client.redirects.$get({ query: { next: "/dashboard" } });

  res.status satisfies 303 | 400;
  // @ts-expect-error 200 は宣言していないので比べられない
  if (res.status === 200) return;
}

// 形式を並べた endpoint も、hc からは JSON に見える。どれも合わなければ 406
export async function greetings() {
  const res = await client.greetings.$get();

  res.status satisfies 200 | 406;
  if (res.status === 200) {
    const body = await res.json();
    body.name satisfies string;
  }
}
