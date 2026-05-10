-- CreateTable
CREATE TABLE "RutinaExcepcion" (
    "id" TEXT NOT NULL,
    "rutinaId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RutinaExcepcion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RutinaExcepcion" ADD CONSTRAINT "RutinaExcepcion_rutinaId_fkey" FOREIGN KEY ("rutinaId") REFERENCES "Rutina"("id") ON DELETE CASCADE ON UPDATE CASCADE;
