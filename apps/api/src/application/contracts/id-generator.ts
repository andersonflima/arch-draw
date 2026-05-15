export type IdGenerator = Readonly<{
  create: () => string;
}>;

export const cryptoIdGenerator: IdGenerator = {
  create: () => crypto.randomUUID()
};

