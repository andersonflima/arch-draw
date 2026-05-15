export type Clock = Readonly<{
  now: () => string;
}>;

export const systemClock: Clock = {
  now: () => new Date().toISOString()
};

