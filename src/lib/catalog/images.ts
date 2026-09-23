/** Representative product photography; fictional catalog products have no physical packaging. */
export const productImages: Record<string, string> = {
  "a5-hardcover-notebook":
    "https://images.unsplash.com/photo-1743385779499-076d13d4cfcf?auto=format&fit=crop&crop=top,left&w=700&h=700&q=84",
  "smooth-ball-pen-set":
    "https://images.unsplash.com/photo-1743385779392-cab22721fac6?auto=format&fit=crop&crop=top,left&w=700&h=700&q=84",
  "a4-copier-paper":
    "https://images.unsplash.com/photo-1620275765334-4ed948bb4502?auto=format&fit=crop&w=700&q=84",
  "permanent-marker-set":
    "https://images.unsplash.com/photo-1743385779392-cab22721fac6?auto=format&fit=crop&crop=bottom,right&w=700&h=700&q=84",
  "metal-stapler-no-10":
    "https://images.pexels.com/photos/7578193/pexels-photo-7578193.jpeg?auto=compress&cs=tinysrgb&w=900",
  "document-file-set":
    "https://images.unsplash.com/photo-1743385779499-076d13d4cfcf?auto=format&fit=crop&crop=bottom,right&w=700&h=700&q=84",
  "sticky-notes-set":
    "https://images.pexels.com/photos/8386687/pexels-photo-8386687.jpeg?auto=compress&w=900",
  "washable-colour-pencil-set":
    "https://images.unsplash.com/photo-1583404569964-10466ea651df?auto=format&fit=crop&w=900&q=84",
  "everyday-basmati-rice":
    "https://images.unsplash.com/photo-1705147271933-5c7052f15a90?auto=format&fit=crop&w=600&q=85",
  "whole-wheat-atta":
    "https://images.unsplash.com/photo-1549590143-d5855148a9d5?auto=format&fit=crop&w=600&q=85",
  "fresh-toned-milk":
    "https://images.unsplash.com/photo-1611211301828-be4b317d0707?auto=format&fit=crop&w=600&q=85",
  "premium-leaf-tea":
    "https://images.unsplash.com/photo-1766185387603-f03cb6d658fa?auto=format&fit=crop&w=600&q=85",
};
/** Hero card photograph: the stationery shoot again, wider, so no new asset is fetched. */
export const heroImage =
  "https://images.unsplash.com/photo-1743385779392-cab22721fac6?auto=format&fit=crop&w=1200&q=80";
export const categoryImages: Record<string, string> = {
  stationery: productImages["smooth-ball-pen-set"],
  paper: productImages["sticky-notes-set"],
  office: productImages["a4-copier-paper"],
  "art-craft": productImages["washable-colour-pencil-set"],
  staples: productImages["everyday-basmati-rice"],
  dairy: productImages["fresh-toned-milk"],
  beverages: productImages["premium-leaf-tea"],
  cooking:
    "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=300&q=80",
};
