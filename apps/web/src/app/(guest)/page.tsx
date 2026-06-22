import Link from "next/link";
import { Button } from "@repo/ui/components/button";
import {
  Rocket,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Zap,
} from "lucide-react";

export default function Home() {
  return (
    <div className="container mx-auto py-24 flex flex-col items-center text-center gap-12">
      <div className="flex flex-col items-center gap-6 max-w-3xl">
        <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary/10 text-primary hover:bg-primary/20">
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            <span>Nueva versión 2.0 disponible</span>
          </span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-6xl bg-clip-text text-transparent bg-linear-to-r from-primary to-primary/60">
          Potencia tu Desarrollo con TurboApp
        </h1>
        <p className="text-xl text-muted-foreground leading-relaxed">
          La plataforma definitiva para construir aplicaciones modernas,
          escalables y seguras. Diseñada para desarrolladores que buscan
          excelencia y velocidad.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
        <Link href="/login" className="w-full sm:w-auto">
          <Button size="lg" className="w-full sm:w-auto gap-2 font-medium">
            <Rocket className="h-4 w-4" />
            Comenzar Ahora
          </Button>
        </Link>
        <Link href="/register" className="w-full sm:w-auto">
          <Button
            variant="outline"
            size="lg"
            className="w-full sm:w-auto gap-2 font-medium"
          >
            Crear Cuenta Gratuita
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12 w-full max-w-5xl text-left">
        <div className="p-6 rounded-2xl bg-muted/50 hover:bg-muted transition-colors">
          <Zap className="h-10 w-10 text-primary mb-4" />
          <h3 className="text-xl font-semibold mb-2">Rendimiento Extremo</h3>
          <p className="text-muted-foreground">
            Arquitectura optimizada para tiempos de carga instantáneos y
            experiencia fluida.
          </p>
        </div>
        <div className="p-6 rounded-2xl bg-muted/50 hover:bg-muted transition-colors">
          <ShieldCheck className="h-10 w-10 text-primary mb-4" />
          <h3 className="text-xl font-semibold mb-2">Seguridad Primero</h3>
          <p className="text-muted-foreground">
            Protección de datos de nivel empresarial y autenticación robusta
            integrada.
          </p>
        </div>
        <div className="p-6 rounded-2xl bg-muted/50 hover:bg-muted transition-colors">
          <CheckCircle2 className="h-10 w-10 text-primary mb-4" />
          <h3 className="text-xl font-semibold mb-2">Escalabilidad Global</h3>
          <p className="text-muted-foreground">
            Infraestructura lista para crecer contigo, desde el primer usuario
            hasta millones.
          </p>
        </div>
      </div>
    </div>
  );
}
