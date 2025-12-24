-- AlterTable
ALTER TABLE "Bet" ADD COLUMN     "priceAtTrade" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "initialLiquidity" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "liquidityParameter" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
ADD COLUMN     "noOdds" DOUBLE PRECISION,
ADD COLUMN     "qNo" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "qYes" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "rules" TEXT,
ADD COLUMN     "yesOdds" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "achievements" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "discord" TEXT,
ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isBanned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "telegram" TEXT,
ADD COLUMN     "twitter" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "MessageReaction" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "resourceId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageReaction_userId_messageId_key" ON "MessageReaction"("userId", "messageId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
