'use client'
import Image from 'next/image'
import { useState } from 'react'
import { ImageOff } from 'lucide-react'
export function FotoTarjeta({ id, alt }: { id: string; alt: string }) {
  const [cargando,setCargando]=useState(true)
  const [fallo,setFallo]=useState(false)
  if(fallo) return <div role="img" aria-label={'Fotografía no disponible: '+alt} className="flex h-full min-h-48 flex-col items-center justify-center gap-2 bg-superficie-alt text-tinta-suave"><ImageOff aria-hidden="true" className="size-7" /><span className="text-sm">Fotografía no disponible</span></div>
  return <>
    {cargando && <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-superficie-alt motion-reduce:animate-none" />}
    <Image src={'/imagen/'+id} alt={alt} width={480} height={320} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" unoptimized
      onLoad={()=>setCargando(false)} onError={()=>{setCargando(false);setFallo(true)}}
      className="relative h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
  </>
}