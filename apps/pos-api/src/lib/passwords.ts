import bcrypt from "bcrypt";

const PASSWORD_COST = 12;
const PIN_COST = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, PASSWORD_COST);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, PIN_COST);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
