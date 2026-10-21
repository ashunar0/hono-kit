// expect: hnk(route-exports-endpoints) | not created with createEndpoint
// 素の配列は、handler の形が同じでも endpoint ではない（認証も responses の契約も無い）
export const GET = [async () => new Response("public")];
