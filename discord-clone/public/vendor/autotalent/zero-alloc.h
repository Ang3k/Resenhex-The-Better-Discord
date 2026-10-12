/* Resenhex allocation adapter for Autotalent. GPL-2.0-or-later. */
#include <stdlib.h>
void *at_allocate(size_t count, size_t size);
void at_deallocate(void *pointer);
#define malloc(n) at_allocate(1, (n))
#define calloc(n,s) at_allocate((n), (s))
#define free(p) at_deallocate((p))
