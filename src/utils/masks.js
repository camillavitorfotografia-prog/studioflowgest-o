// Máscara para Moeda (R$ 1.500,00)
export const maskCurrency = (value) => {
  if (!value) return "";
  
  let v = value.replace(/\D/g, "");
  if (v === "") return "";

  v = (parseInt(v, 10) / 100).toFixed(2) + "";
  v = v.replace(".", ",");
  v = v.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
  
  return v;
};

// Máscara exata para WhatsApp: (73) 9 0000-0000
export const maskPhone = (value) => {
  if (!value) return "";
  
  let v = value.replace(/\D/g, "");
  if (v.length > 11) v = v.slice(0, 11);

  if (v.length === 0) return "";
  if (v.length <= 2) return `(${v}`;
  if (v.length === 3) return `(${v.slice(0,2)}) ${v.slice(2)}`;
  if (v.length <= 7) return `(${v.slice(0,2)}) ${v.slice(2,3)} ${v.slice(3)}`;
  
  return `(${v.slice(0,2)}) ${v.slice(2,3)} ${v.slice(3,7)}-${v.slice(7)}`;
};

// Formatação inteligente de Nome (Ex: joão da silva -> João da Silva)
export const capitalizeName = (value) => {
  if (!value) return "";
  
  const preposicoes = ["de", "da", "do", "das", "dos", "e"];
  
  return value
    .split(" ")
    .map((word, index) => {
      const lowerWord = word.toLowerCase();
      // Se for uma preposição e não for a primeira palavra, mantém minúsculo
      if (index !== 0 && preposicoes.includes(lowerWord)) {
        return lowerWord;
      }
      // Caso contrário, primeira letra maiúscula e o resto minúsculo
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};