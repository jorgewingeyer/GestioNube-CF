import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  CardDescription,
} from "@repo/ui/components/card";
import { RegisterForm } from "./components/register-form";
import Link from "next/link";
import { UserPlus } from "lucide-react";

export default function RegisterPage() {
  return (
    <Card className="border-0 shadow-none w-full max-w-md">
      <CardHeader className="text-center space-y-2">
        <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
          <UserPlus className="h-5 w-5 text-primary" />
        </div>
        <CardTitle className="text-2xl font-bold">
          Únete a nuestra comunidad
        </CardTitle>
        <CardDescription className="text-base">
          Crea tu cuenta en segundos y comienza a disfrutar de todos los
          beneficios.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
      </CardContent>
      <CardFooter className="flex justify-center">
        <p className="text-sm text-muted-foreground">
          ¿Ya tienes una cuenta?{" "}
          <Link
            href="/login"
            className="text-primary font-medium hover:underline transition-all"
          >
            Accede aquí
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
