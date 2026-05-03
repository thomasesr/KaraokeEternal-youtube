-- Up
ALTER TABLE "media" ADD COLUMN "mediaType" text NOT NULL DEFAULT('cdg');

-- Down
ALTER TABLE "media" DROP COLUMN "mediaType";
