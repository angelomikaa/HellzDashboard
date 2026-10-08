import bcrypt from 'bcryptjs'
const pin = process.argv[2]
if (!pin || !/^\d{4}$/.test(pin)) {
  console.error('Usage: node scripts/hash-pin.mjs <4-digit-pin>')
  process.exit(1)
}
console.log(bcrypt.hashSync(pin, 10))
