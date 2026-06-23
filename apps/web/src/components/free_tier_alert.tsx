// import { usePage, Link } from "@inertiajs/react";
// import { PageProps as InertiaPageProps } from "@inertiajs/core";
// import { InfoIcon, ArrowRightIcon, AlertTriangleIcon } from "lucide-react";
// import { Button } from "@/components/ui/button";
// import SuscriptionController from "@/actions/App/Http/Controllers/SuscriptionController";
// import { FreeTierResources } from "@/types/freeTierResources";

// interface PageProps extends InertiaPageProps {
//   isFreeTier?: boolean;
//   FreeTierResources?: FreeTierResources;
//   [key: string]: any;
// }

// const FreeTierAlert = () => {
//   const { props, url } = usePage<PageProps>();
//   const { isFreeTier, FreeTierResources } = props;
//   const pathToSuscription = SuscriptionController.index();
//   const showOnSuscrioption = !pathToSuscription.url.includes(url);

//   return (
//     <div>
//       {isFreeTier && showOnSuscrioption && (
//         <div className="bg-muted/50 border border-muted-foreground/20 rounded-lg px-4 py-2 mx-4 mb-4 ">
//           <div className="flex items-center gap-3">
//             {FreeTierResources?.all_resources_complete ? (
//               <AlertTriangleIcon className="h-4 w-4 text-orange-400 dark:text-orange-300 flex-shrink-0" />
//             ) : (
//               <InfoIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
//             )}
//             <div className="flex-1">
//               {FreeTierResources?.all_resources_complete ? (
//                 <p className="text-sm text-orange-400 dark:text-orange-300 font-medium">
//                   Has alcanzado el límite de tu plan gratuito.
//                   <span className="text-muted-foreground ml-1">
//                     Actualiza para continuar usando todas las funciones.
//                   </span>
//                 </p>
//               ) : (
//                 <p className="text-sm text-muted-foreground">
//                   Estás en modo de prueba con limitaciones.
//                   <span className="text-muted-foreground ml-1">
//                     Desbloquea todas las funciones premium para potenciar tu
//                     negocio.
//                   </span>
//                 </p>
//               )}
//             </div>
//             <Button
//               asChild
//               variant="ghost"
//               size="sm"
//               className={
//                 FreeTierResources?.all_resources_complete
//                   ? "text-orange-400 dark:text-orange-300 hover:text-orange-500 hover:bg-orange-50"
//                   : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
//               }
//             >
//               <Link href={pathToSuscription}>
//                 Actualizar plan
//                 <ArrowRightIcon className="h-3.5 w-3.5" />
//               </Link>
//             </Button>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };
// export default FreeTierAlert;
