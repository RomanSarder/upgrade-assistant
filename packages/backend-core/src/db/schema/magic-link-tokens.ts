import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";
import { relations } from "drizzle-orm";

export const magicLinkTokens = pgTable("magic_link_tokens", {
  token: text().primaryKey().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  userId: uuid().notNull().references(() => users.id)
})

export const magicLinkTokensRelations = relations(magicLinkTokens, ({ one }) => {
  return {
    user: one(users, {
      fields: [magicLinkTokens.userId],
      references: [users.id],
    })
  }
})
