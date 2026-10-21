/**
 * 指摘に、詳しく読む docs のページを添える。
 * lint の文言だけで直すと、決まりの理由や周りの決まりを読まずに済ませてしまうので
 */
export const reportWithDocs = (context, page) => (descriptor) =>
  context.report({
    ...descriptor,
    message: `${descriptor.message.replace(/[.\s]*$/, "")}. More: node_modules/hono-kit/docs/${page}`,
  });
